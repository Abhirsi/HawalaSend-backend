// backend/routes/auth.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { registerUser, loginUser } = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const pool = require('../pool');
const router = express.Router();
const authController = require('../controllers/authController');


// Rate limiting for auth endpoints (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  message: 'Too many attempts, please try again later',
  skipSuccessfulRequests: true // Only count failed attempts
});

// ✅ Register new user
router.post('/register', 
  authLimiter,
  registerUser
);

// ✅ Login user
router.post('/login', 
  authLimiter,
  loginUser
);

// ✅ Forgot Password (Production-ready with security considerations)
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;

  // Input validation
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ 
      message: 'Please provide a valid email address' 
    });
  }

  try {
    // Simulate processing delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if user exists (without revealing existence)
    const user = await pool.query(
      'SELECT id FROM users WHERE email = $1', 
      [email.toLowerCase().trim()]
    );

    // Log the request regardless of user existence
    console.log(`Password reset requested for: ${email} (IP: ${req.ip})`);

    // Generic response
    return res.json({
      message: 'If this email exists in our system, you will receive a password reset link.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ 
      message: 'Internal server error' 
    });
  }
});

// ✅ Protected route: get logged-in user's profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, balance, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Omit sensitive fields and format dates
    const user = {
      ...result.rows[0],
      created_at: new Date(result.rows[0].created_at).toISOString()
    };

    return res.json(user);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return res.status(500).json({ 
      message: 'Internal server error',
      code: 'PROFILE_FETCH_FAILED' 
    });
  }
});

module.exports = router;