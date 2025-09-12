import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const SALT_ROUNDS = 12;
const PASSWORD_MIN_LENGTH = parseInt(process.env.MIN_PASSWORD_LENGTH) || 12;

// Helper function to sanitize user data
const sanitizeUser = (user) => ({
  id: user.id,
  email: user.email,
  username: user.username,
  first_name: user.first_name,
  last_name: user.last_name,
  phone: user.phone,
  created_at: user.created_at,
});

export const registerUser = async (req, res) => {
  let client;
  try {
    const { email, password, username, first_name, last_name, phone } = req.body;
    const trimmedEmail = email?.trim();
    const trimmedUsername = username?.trim();
    const trimmedFirstName = first_name?.trim();
    const trimmedLastName = last_name?.trim();
    const trimmedPhone = phone?.trim();

    // Log registration attempt
    console.log(`Registration attempt for ${trimmedEmail} from IP: ${req.ip}`);

    // Validation
    if (!trimmedEmail || !password || !trimmedUsername || !trimmedFirstName || !trimmedLastName || !trimmedPhone) {
      return res.status(400).json({
        error: 'All fields are required',
        code: 'MISSING_FIELDS',
        details: {
          email: !trimmedEmail ? 'Email is required' : null,
          password: !password ? 'Password is required' : null,
          username: !trimmedUsername ? 'Username is required' : null,
          first_name: !trimmedFirstName ? 'First name is required' : null,
          last_name: !trimmedLastName ? 'Last name is required' : null,
          phone: !trimmedPhone ? 'Phone is required' : null,
        },
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      });
    }

    if (password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        code: 'PASSWORD_TOO_SHORT',
      });
    }

    // Enhanced password validation
    if (!/(?=.*[A-Z])(?=.*[0-9])/.test(password)) {
      return res.status(400).json({
        error: 'Password must contain at least 1 number and 1 uppercase letter',
        code: 'PASSWORD_WEAK',
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
        code: 'USER_EXISTS',
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert new user with transaction
    client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO users (email, password_hash, salt, username, first_name, last_name, phone, balance, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, email, username, first_name, last_name, phone, balance, created_at`,
        [trimmedEmail.toLowerCase(), password_hash, salt, trimmedUsername, trimmedFirstName, trimmedLastName, trimmedPhone, 0.00]
      );

      if (result.rows.length === 0) {
        throw new Error('Failed to create user - no rows returned');
      }

      const newUser = result.rows[0];

      // Generate JWT
      const token = jwt.sign(
        { id: newUser.id, email: newUser.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
      );

      // Log successful registration
      await client.query(
        'INSERT INTO security_logs (user_id, action, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [newUser.id, 'user_registered', req.ip, req.get('User-Agent')]
      );

      await client.query('COMMIT');

      // Set secure HTTP-only cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      console.log(`User registered successfully: ${newUser.email}`);

      return res.status(201).json({
        message: 'User registered successfully',
        user: sanitizeUser(newUser),
        token,
      });
    } catch (insertError) {
      await client.query('ROLLBACK');
      console.error('Database insert error:', insertError);
      throw insertError;
    }
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({
      error: 'Registration failed. Please try again.',
      code: 'REGISTRATION_FAILED',
      ...(process.env.NODE_ENV === 'development' && { debug: err.message }),
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Log login attempt
    console.log(`Login attempt for ${email} from IP: ${req.ip}`);

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
        code: 'MISSING_CREDENTIALS',
      });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, username, password_hash, first_name, last_name, phone, login_attempts, locked_until FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    const user = result.rows[0];
    const errorResponse = {
      error: 'Invalid email or password',
      code: 'INVALID_CREDENTIALS',
    };

    if (!user) {
      // Simulate password comparison timing
      await bcrypt.compare(password, '$2b$12$fakehashfor.timing.attack.prevention');
      console.warn(`Login failed - user not found: ${email}`);
      return res.status(401).json(errorResponse);
    }

    // Check if account is locked
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return res.status(423).json({
        error: 'Account is temporarily locked. Please try again later.',
        code: 'ACCOUNT_LOCKED',
      });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Increment login attempts
      await pool.query(
        'UPDATE users SET login_attempts = login_attempts + 1, locked_until = CASE WHEN login_attempts >= 4 THEN NOW() + INTERVAL \'15 minutes\' ELSE NULL END WHERE id = $1',
        [user.id]
      );
      console.warn(`Login failed - invalid password: ${email}`);
      return res.status(401).json(errorResponse);
    }

    // Reset login attempts on successful login
    await pool.query(
      'UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
    );

    // Log successful login
    await pool.query(
      'INSERT INTO security_logs (user_id, action, ip_address, user_agent, created_at) VALUES ($1, $2, $3, $4, NOW())',
      [user.id, 'user_login', req.ip, req.get('User-Agent')]
    );

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    console.log(`User logged in successfully: ${user.email}`);

    return res.json({
      message: 'Login successful',
      user: sanitizeUser(user),
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      error: 'Authentication failed. Please try again.',
      code: 'AUTH_FAILURE',
    });
  }
};