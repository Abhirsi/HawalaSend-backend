import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`Login attempt for ${email} from IP: ${req.ip}`);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Simple user lookup - only use columns that exist
    const result = await pool.query(
      'SELECT id, email, username, password_hash, first_name, last_name, phone FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    const user = result.rows[0];
    if (!user) {
      console.log(`Login failed - user not found: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`Login failed - invalid password: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT - match your working local version
    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    console.log(`User logged in successfully: ${user.email}`);

    // Return response that matches your frontend expectations
    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

export const registerUser = async (req, res) => {
  try {
    const { email, password, username, first_name, last_name, phone } = req.body;
    
    // Basic validation
    if (!email || !password || !username || !first_name || !last_name) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // Check existing user
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user - only use columns that exist
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, username, first_name, last_name, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id, email, username, first_name, last_name, phone',
      [email.toLowerCase(), password_hash, username, first_name, last_name, phone]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });

    return res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
};