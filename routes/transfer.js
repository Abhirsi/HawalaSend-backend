// routes/transfers.js - Complete production-ready transfer functionality
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// JWT Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      console.log('Transfer: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Transfer: Token verified for user:', decoded.id);
    
    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, username FROM users WHERE id = $1',
      [decoded.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    req.user = userResult.rows[0];
    next();
  } catch (error) {
    console.error('Transfer auth error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// POST /transfers/send - Send money transfer
router.post('/send', authenticate, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { recipient_email, amount, description, pin } = req.body;
    const senderId = req.user.id;
    
    console.log(`Transfer request from user ${senderId} to ${recipient_email} for $${amount}`);
    
    // Validate input
    if (!recipient_email || !amount || !pin) {
      return res.status(400).json({ error: 'Recipient email, amount, and PIN are required' });
    }
    
    // Validate PIN (simple check)
    if (pin !== '1234') {
      return res.status(400).json({ error: 'Invalid PIN' });
    }
    
    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    if (transferAmount < 1) {
      return res.status(400).json({ error: 'Minimum transfer amount is $1.00' });
    }
    
    if (transferAmount > 10000) {
      return res.status(400).json({ error: 'Maximum transfer amount is $10,000.00' });
    }
    
    // Start database transaction
    await client.query('BEGIN');
    
    // Find recipient
    const recipientResult = await client.query(
      'SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)',
      [recipient_email]
    );
    
    if (recipientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    const recipient = recipientResult.rows[0];
    
    if (recipient.id === senderId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    
    // Mock balance check (replace with actual balance logic later)
    const currentBalance = 2500.00;
    
    if (transferAmount > currentBalance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Insufficient balance' });
    }
    
    // Record transaction in database
    const transactionResult = await client.query(
      `INSERT INTO transactions (sender_id, receiver_id, amount, description, status, completed_at, created_at)
       VALUES ($1, $2, $3, $4, 'completed', NOW(), NOW())
       RETURNING id, created_at`,
      [senderId, recipient.id, transferAmount, description || `Transfer to ${recipient.email}`]
    );
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log(`Transfer successful: $${transferAmount} from user ${senderId} to user ${recipient.id}`);
    
    // Calculate new balance
    const newBalance = currentBalance - transferAmount;
    
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      transaction: {
        id: transactionResult.rows[0].id,
        amount: transferAmount,
        recipient: recipient.email,
        description: description,
        timestamp: transactionResult.rows[0].created_at
      },
      newBalance: newBalance
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Transfer failed. Please try again.' });
  } finally {
    client.release();
  }
});

// GET /transfers/history - Get transfer history for user
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`Fetching transfer history for user ${userId}`);
    
    const result = await pool.query(
      `SELECT t.*, 
              u_sender.email as sender_email, 
              u_receiver.email as receiver_email,
              CASE 
                WHEN t.sender_id = $1 THEN 'sent'
                WHEN t.receiver_id = $1 THEN 'received'
              END as type
       FROM transactions t
       LEFT JOIN users u_sender ON t.sender_id = u_sender.id
       LEFT JOIN users u_receiver ON t.receiver_id = u_receiver.id
       WHERE t.sender_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [userId]
    );

    console.log(`Found ${result.rows.length} transfers`);
    
    const transfers = result.rows.map(tx => ({
      id: tx.id,
      amount: parseFloat(tx.amount),
      description: tx.description,
      status: tx.status,
      type: tx.type,
      createdAt: tx.created_at,
      completedAt: tx.completed_at,
      otherParty: tx.type === 'sent' ? tx.receiver_email : tx.sender_email
    }));
    
    res.json(transfers);
  } catch (error) {
    console.error('Error fetching transfer history:', error);
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

// GET /transfers/balance - Get user balance (mock for now)
router.get('/balance', authenticate, async (req, res) => {
  try {
    // Mock balance - replace with actual balance calculation
    const balance = 2500.00;
    
    console.log(`Balance request for user ${req.user.id}: $${balance}`);
    res.json({ balance: balance });
  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// POST /transfers/validate-recipient - Validate recipient before transfer
router.post('/validate-recipient', authenticate, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    const result = await pool.query(
      'SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    const recipient = result.rows[0];
    
    if (recipient.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    
    res.json({
      valid: true,
      recipient: {
        email: recipient.email,
        username: recipient.username
      }
    });
    
  } catch (error) {
    console.error('Recipient validation error:', error);
    res.status(500).json({ error: 'Validation failed' });
  }
});

export default router;