// ============================
// routes/transfer.js - Money Transfers
// ============================

import express from 'express';
import pool from '../pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// -----------------------------
// POST /transfers - Create a transfer
// -----------------------------
router.post('/send', authenticate, async (req, res) => {
  const { receiver_id, amount, description } = req.body;
  const sender_id = req.user.id;

  try {
    // 1. Prevent self-transfer
    if (receiver_id === sender_id) {
      return res.status(400).json({ error: 'Cannot send money to yourself' });
    }

    // 2. Check sender balance
    const senderResult = await pool.query('SELECT balance FROM users WHERE id=$1', [sender_id]);
    const senderBalance = parseFloat(senderResult.rows[0].balance);
    if (amount > senderBalance) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    // 3. Perform transfer in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Deduct from sender
      await client.query('UPDATE users SET balance = balance - $1 WHERE id=$2', [amount, sender_id]);

      // Credit receiver
      await client.query('UPDATE users SET balance = balance + $1 WHERE id=$2', [amount, receiver_id]);

      // Record transaction
      const tx = await client.query(
        `INSERT INTO transactions (sender_id,receiver_id,amount,description,status) 
         VALUES ($1,$2,$3,$4,'completed') RETURNING *`,
        [sender_id, receiver_id, amount, description]
      );

      await client.query('COMMIT');
      res.json({ message: 'Transfer successful', transaction: tx.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Transfer failed:', err);
      res.status(500).json({ error: 'Transfer failed' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Transfer error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -----------------------------
// GET /transfers - List user’s transfers
// -----------------------------
router.get('/history', authenticate, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE sender_id=$1 OR receiver_id=$1 
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Fetch transfers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
