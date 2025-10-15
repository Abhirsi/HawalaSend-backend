import express from 'express';
import pool from '../pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.put('/profile', authenticate, async (req, res) => {
  const { firstName, lastName, phoneNumber, username } = req.body;
  
  try {
    console.log('📝 Profile update request:', { userId: req.user.id, username });
    
    // Check if username is taken by another user
    if (username) {
      const existing = await pool.query(
        'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
        [username, req.user.id]
      );
      
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }
    
    const result = await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, phone_number = $3, username = $4
       WHERE id = $5
       RETURNING id, email, username, first_name, last_name, phone_number`,
      [firstName, lastName, phoneNumber, username, req.user.id]
    );
    
    console.log('✅ Profile updated for user:', result.rows[0].email);
    
    res.json({
      message: 'Profile updated successfully',
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        username: result.rows[0].username,
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        phoneNumber: result.rows[0].phone_number
      }
    });
  } catch (error) {
    console.error('❌ Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;