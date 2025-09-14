// routes/transfers.js - Complete transfer functionality
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../pool.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// POST /transfers/send - Money transfer endpoint
router.post('/send', authenticate, async (req, res) => {
  const client = await pool.connect();
  const startTime = Date.now();
  const { recipient_email, amount, description, pin } = req.body;
  const senderId = req.user.id;
  
  try {
    await client.query('BEGIN');
    
    console.log(`Transfer request from user ${senderId} to ${recipient_email} for $${amount}`);
    console.log('Request body:', req.body);
    
    // Validate PIN (simple validation for demo)
    const pinString = String(pin);
    if (pinString !== '1234') {
      console.log(`Transfer failed - Invalid PIN: ${pinString}`);
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid PIN' });
    }
    
    // Get sender information
    const senderResult = await client.query(
      'SELECT id, email, username, first_name, last_name, balance FROM users WHERE id = $1',
      [senderId]
    );
    
    const sender = senderResult.rows[0];
    if (!sender) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sender not found' });
    }
    
    // Check balance
    const senderBalance = parseFloat(sender.balance) || 0;
    const transferAmount = parseFloat(amount);
    const fee = transferAmount * 0.01; // 1% fee
    const totalDeduction = transferAmount + fee;
    
    if (senderBalance < totalDeduction) {
      console.log(`Transfer failed - Insufficient funds: Balance $${senderBalance}, Required $${totalDeduction}`);
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Insufficient funds',
        balance: senderBalance,
        required: totalDeduction
      });
    }
    
    // Find recipient
    const recipientResult = await client.query(
      'SELECT id, email, username FROM users WHERE LOWER(email) = LOWER($1)',
      [recipient_email.trim()]
    );
    
    const recipient = recipientResult.rows[0];
    if (!recipient) {
      console.log(`Transfer failed - Recipient not found: ${recipient_email}`);
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Recipient not found' });
    }
    
    // Prevent self-transfer
    if (sender.id === recipient.id) {
      console.log('Transfer failed - Self transfer attempt');
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot transfer to yourself' });
    }
    
    // Update sender balance
    await client.query(
      'UPDATE users SET balance = balance - $1, updated_at = NOW() WHERE id = $2',
      [totalDeduction, senderId]
    );
    
    // Update recipient balance
    await client.query(
      'UPDATE users SET balance = balance + $1, updated_at = NOW() WHERE id = $2',
      [transferAmount, recipient.id]
    );
    
    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO transactions (sender_id, receiver_id, amount, fee, description, status, completed_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'completed', NOW(), NOW())
       RETURNING id, created_at`,
      [senderId, recipient.id, transferAmount, fee, description || 'Money transfer']
    );
    
    const transaction = transactionResult.rows[0];
    
    // Get updated balance
    const updatedBalanceResult = await client.query(
      'SELECT balance FROM users WHERE id = $1',
      [senderId]
    );
    const newBalance = parseFloat(updatedBalanceResult.rows[0].balance);
    
    await client.query('COMMIT');
    
    console.log(`Transfer successful: $${transferAmount} from user ${senderId} to user ${recipient.id}`);
    
    res.json({
      success: true,
      message: 'Transfer completed successfully',
      transaction: {
        id: transaction.id,
        amount: transferAmount,
        fee: fee,
        recipient: {
          email: recipient.email,
          username: recipient.username
        },
        description: description || 'Money transfer',
        status: 'completed',
        created_at: transaction.created_at
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

// GET /transfers/history - User's transfer history
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    console.log(`Fetching transfer history for user ${userId}`);
    
    // Get transfers where user is sender or receiver
    const transfers = await pool.query(`
      SELECT 
        t.id,
        t.amount,
        t.fee,
        t.description,
        t.status,
        t.created_at,
        t.completed_at,
        CASE 
          WHEN t.sender_id = $1 THEN 'sent'
          ELSE 'received'
        END as type,
        CASE 
          WHEN t.sender_id = $1 THEN r.email
          ELSE s.email  
        END as other_party_email,
        CASE 
          WHEN t.sender_id = $1 THEN r.username
          ELSE s.username
        END as other_party_username
      FROM transactions t
      JOIN users s ON t.sender_id = s.id
      JOIN users r ON t.receiver_id = r.id
      WHERE t.sender_id = $1 OR t.receiver_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE sender_id = $1 OR receiver_id = $1',
      [userId]
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    res.json({
      transfers: transfers.rows,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
    
  } catch (error) {
    console.error('Transfer history error:', error);
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

// GET /transfers/balance - User's current balance
router.get('/balance', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const result = await pool.query(
      'SELECT balance, first_name, last_name FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({
      balance: parseFloat(user.balance) || 0,
      user: {
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
    
  } catch (error) {
    console.error('Balance fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

export default router;