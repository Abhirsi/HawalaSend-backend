// backend/Controllers/authController.js
//const { validateEmail } = require('../utils/validators');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../pool');
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
  try {
    const { email, password, username } = req.body;
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();

    // Log attempt
    console.log(`Registration attempt for ${trimmedEmail} from IP: ${req.ip}`);

    // Validation
    if (!trimmedEmail || !password || !trimmedUsername) {
      return res.status(400).json({ 
        error: 'All fields are required',
        code: 'MISSING_FIELDS'
      });
    }

    if (!validateEmail(trimmedEmail)) {
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

    // Add this new check
    if (!/(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
      return res.status(400).json({
        error: 'Password must contain at least 1 number and 1 uppercase letter',
        code: 'PASSWORD_WEAK'
      });
    }

    // Check existing user
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

    // Hash password with modern cost factor
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Insert new user with transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        `INSERT INTO users (email, password, username)
         VALUES ($1, $2, $3)
         RETURNING id, email, username, role, created_at`,
        [email.toLowerCase().trim(), hashedPassword, username.trim()]
      );

      const newUser = result.rows[0];
      
      // Generate JWT with secure settings
      const token = jwt.sign(
        { 
          id: newUser.id,
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
        sameSite: 'strict',
        maxAge: 3600000 // 1 hour
      });

      return res.status(201).json({
        user: sanitizeUser(newUser)
      });

    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ 
      error: 'Registration failed',
      code: 'REGISTRATION_FAILED'
    });
  }
};

// ✅ Login existing user (Production-ready)
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

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
      return res.status(401).json(errorResponse);
    }

    // Compare password with constant-time comparison
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json(errorResponse);
    }

    // Generate JWT
    const token = jwt.sign(
      { 
        id: user.id,
        role: user.role 
      }, 
      JWT_SECRET, 
      { 
        expiresIn: JWT_EXPIRES_IN,
        algorithm: 'HS256' 
      }
    );

    //Logout route
    router.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      res.json({ message: 'Logged out successfully' });
    });
    

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 3600000 // 1 hour
    });

    return res.json({
      user: sanitizeUser(user)
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ 
      error: 'Authentication failed',
      code: 'AUTH_FAILURE'
    });
  }
};