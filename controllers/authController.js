// backend/Controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../pool'); // ✅ Updated import to destructure pool
const logger = require('../utils/logger');
const { validateEmail, validatePassword } = require('../utils/validators');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

// Constants
const SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = 8;

// Helper function to sanitize user data
const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  role: user.role,
  created_at: user.created_at
});

// ✅ Register a new user (Production-ready)
exports.registerUser = async (req, res) => {
  let client;
  
  try {
    const { email, password, username } = req.body;
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();

    // Log registration attempt
    logger.info(`Registration attempt for ${trimmedEmail} from IP: ${req.ip}`);
    console.log(`Registration attempt for ${trimmedEmail} from IP: ${req.ip}`);

    // Validation
    if (!trimmedEmail || !password || !trimmedUsername) {
      return res.status(400).json({ 
        error: 'All fields are required',
        code: 'MISSING_FIELDS',
        details: {
          email: !trimmedEmail ? 'Email is required' : null,
          password: !password ? 'Password is required' : null,
          username: !trimmedUsername ? 'Username is required' : null
        }
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({ 
        error: 'Invalid email format',
        code: 'INVALID_EMAIL'
      });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        code: 'PASSWORD_TOO_SHORT'
      });
    }

    // Enhanced password validation
    if (!/(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
      return res.status(400).json({
        error: 'Password must contain at least 1 number and 1 uppercase letter',
        code: 'PASSWORD_WEAK'
      });
    }

    // Check existing user with better error handling
    try {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)',
        [trimmedEmail, trimmedUsername]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({ 
          error: 'Email or username already in use',
          code: 'USER_EXISTS'
        });
      }
    } catch (dbError) {
      console.error('Database query error (check existing user):', dbError);
      logger.error('Database query error during user check', { error: dbError.message, email: trimmedEmail });
      return res.status(500).json({ 
        error: 'Database connection failed',
        code: 'DB_CONNECTION_ERROR'
      });
    }

    // Hash password with modern cost factor
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert new user with transaction
    client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO users (email, password, username, role, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id, email, username, role, created_at`,
        [trimmedEmail.toLowerCase(), hashedPassword, trimmedUsername, 'user']
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to create user - no rows returned');
      }

      const newUser = result.rows[0];
      
      // Generate JWT with secure settings
      const token = jwt.sign(
        { 
          id: newUser.id,
          email: newUser.email,
          role: newUser.role 
        }, 
        JWT_SECRET, 
        { 
          expiresIn: JWT_EXPIRES_IN,
          algorithm: 'HS256' 
        }
      );

      await client.query('COMMIT');
      
      // Set secure HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict', // Updated for cross-origin
        maxAge: 3600000 // 1 hour
      });

      logger.info(`User registered successfully: ${newUser.email}`, { userId: newUser.id });

      return res.status(201).json({
        message: 'User registered successfully',
        user: sanitizeUser(newUser),
        token: token // Include token in response for client-side storage if needed
      });

    } catch (insertError) {
      await client.query('ROLLBACK');
      console.error('Database insert error:', insertError);
      logger.error('Failed to insert new user', { error: insertError.message, email: trimmedEmail });
      throw insertError;
    }

  } catch (err) {
    console.error('Registration error:', err);
    logger.error('Registration failed', { 
      error: err.message, 
      stack: err.stack,
      email: req.body?.email,
      ip: req.ip 
    });
    
    return res.status(500).json({ 
      error: 'Registration failed. Please try again.',
      code: 'REGISTRATION_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: err.message })
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

// ✅ Login existing user (Production-ready)
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Log login attempt
    logger.info(`Login attempt for ${email} from IP: ${req.ip}`);

    // Validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Find user with case-insensitive email
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    
    const user = result.rows[0];
    const errorResponse = {
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS'
    };

    if (!user) {
      // Simulate password comparison timing to prevent timing attacks
      await bcrypt.compare(password, '$2b$12$fakehashfor.timing.attack.prevention');
      logger.warn(`Login failed - user not found: ${email}`, { ip: req.ip });
      return res.status(401).json(errorResponse);
    }

    // Compare password with constant-time comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.warn(`Login failed - invalid password: ${email}`, { ip: req.ip });
      return res.status(401).json(errorResponse);
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user.id,
        email: user.email,
        role: user.role 
      }, 
      JWT_SECRET, 
      { 
        expiresIn: JWT_EXPIRES_IN,
        algorithm: 'HS256' 
      }
    );

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 3600000 // 1 hour
    });

    logger.info(`User logged in successfully: ${user.email}`, { userId: user.id });

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token: token // Include token in response
    });

  } catch (err) {
    console.error('Login error:', err);
    logger.error('Login failed', { 
      error: err.message, 
      email: req.body?.email,
      ip: req.ip 
    });
    
    return res.status(500).json({ 
      error: 'Authentication failed. Please try again.',
      code: 'AUTH_FAILURE'
    });
  }
};
<<<<<<< HEAD

// ✅ Logout user
exports.logoutUser = (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
    });

    logger.info('User logged out successfully', { ip: req.ip });
    
    res.json({ 
      message: 'Logged out successfully',
      success: true 
    });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ 
      error: 'Logout failed',
      code: 'LOGOUT_FAILED' 
    });
  }
};

// ✅ Get current user (for protected routes)
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'User not authenticated',
        code: 'NOT_AUTHENTICATED' 
      });
    }

    const result = await pool.query(
      'SELECT id, email, username, role, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'User not found',
        code: 'USER_NOT_FOUND' 
      });
    }

    const user = result.rows[0];
    res.json({
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('Get current user error:', err);
    res.status(500).json({ 
      error: 'Failed to get user information',
      code: 'GET_USER_FAILED' 
    });
  }
};
=======
>>>>>>> 2f7a1654cf4d92d16f7d23c258d88da1dc3367da
