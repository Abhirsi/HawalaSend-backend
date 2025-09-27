// ================================
// middleware/auth.js
// ================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Authentication middleware to protect routes
export function authenticate(req, res, next) {
  try {
    // Check for token in headers (Bearer token) or cookies
    const authHeader = req.headers['authorization'];
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // attach decoded user info to request
    next();
  } catch (err) {
    console.error('❌ Auth error:', err.message);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
