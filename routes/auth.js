// backend/routes/auth.js - Complete auth routes with registration
import express from 'express';
import pool from '../pool.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes working' });
});

// Registration route - ADD THIS
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, firstName, lastName } = req.body;
    
    console.log('Registration attempt for:', email);
    
    // Validate required fields
    if (!email || !username || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        error: 'All fields are required: email, username, password, firstName, lastName' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    
    if (existingUser.rows.length > 0) {
      const existing = existingUser.rows[0];
      if (existing.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      } else {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, username, password_hash, first_name, last_name, balance) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, username, first_name, last_name, balance, created_at`,
      [email, username, hashedPassword, firstName, lastName, 0.00]
    );
    
    const user = newUser.rows[0];
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    console.log('User created successfully:', email);
    
    // Return user data (excluding password hash) and token
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: parseFloat(user.balance),
        created_at: user.created_at
      },
      token: token
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle specific database errors
    if (error.code === '23505') { // PostgreSQL unique violation
      if (error.constraint?.includes('email')) {
        return res.status(400).json({ error: 'Email already registered' });
      } else if (error.constraint?.includes('username')) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// Login route - Updated
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for:', email);
    
    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user in database
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = userResult.rows[0];
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );
    
    console.log('User logged in successfully:', email);
    
    // Return user data (excluding password hash) and token
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: parseFloat(user.balance || 0)
      },
      token: token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Password reset request (for future use)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );
    
    if (userResult.rows.length === 0) {
      // Don't reveal whether email exists or not for security
      return res.json({ message: 'If this email is registered, you will receive a password reset link' });
    }
    
    // TODO: Implement actual password reset email sending
    console.log('Password reset requested for:', email);
    
    res.json({ message: 'If this email is registered, you will receive a password reset link' });
    
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;