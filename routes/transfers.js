// ============================
// routes/transfers.js - Money Transfer Routes
// ============================

import express from 'express';
import pool from '../pool.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// -----------------------------
// POST /transfers/send - Create a transfer
// -----------------------------
router.post('/send', authenticate, async (req, res) => {
  const {
    recipientName,
    recipientEmail,
    recipientPhone,
    amount,
    fromCurrency,
    toCurrency,
    paymentMethod,
    notes
  } = req.body;

  const senderId = req.user.id;

  try {
    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!recipientName) {
      return res.status(400).json({ error: 'Recipient name required' });
    }
    if (!recipientEmail && !recipientPhone) {
      return res.status(400).json({ error: 'Recipient phone or email required' })
    }

    if (!fromCurrency || !toCurrency) {
      return res.status(400).json({ error: 'Currency information required' });
    }

    // Calculate fees (2.5% + $2 flat fee)
    const feePercentage = 0.025;
    const flatFee = 2.00;
    const transferFee = (parseFloat(amount) * feePercentage) + flatFee;
    const totalAmount = parseFloat(amount) + transferFee;

    // Exchange rate (CAD to KES)
    const exchangeRate = fromCurrency === 'CAD' ? 110.45 : 150.25; // Match frontend rates
    const recipientAmount = toCurrency === 'KES' ? amount * exchangeRate : amount;

    // Create transaction record
    const result = await pool.query(
      `INSERT INTO transactions (
        sender_id,
        recipient_name,
        recipient_email,
        recipient_phone,
        amount,
        fee,
        total_amount,
        from_currency,
        to_currency,
        recipient_amount,
        exchange_rate,
        payment_method,
        notes,
        status,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      RETURNING *`,
      [
        senderId,
        recipientName,
        recipientEmail,
        recipientPhone,
        amount,
        transferFee,
        totalAmount,
        fromCurrency,
        toCurrency,
        recipientAmount,
        exchangeRate,
        paymentMethod || 'card',
        notes || '',
        'completed'
      ]
    );

    const transaction = result.rows[0];

    res.status(201).json({
      message: 'Transfer initiated successfully',
      transaction: {
        id: transaction.id,
        amount: transaction.amount,
        fee: transaction.fee,
        totalAmount: transaction.total_amount,
        recipientAmount: transaction.recipient_amount,
        fromCurrency: transaction.from_currency,
        toCurrency: transaction.to_currency,
        status: transaction.status,
        createdAt: transaction.created_at
      }
    });

  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Transfer failed. Please try again.' });
  }
});

// -----------------------------
// GET /transfers/history - Get user's sent transfers only
// -----------------------------
router.get('/history', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, status } = req.query;

  try {
    let query = `
      SELECT 
        t.id,
        t.recipient_name,
        t.recipient_email,
        t.recipient_phone,
        t.amount,
        t.fee,
        t.total_amount,
        t.from_currency,
        t.to_currency,
        t.recipient_amount,
        t.exchange_rate,
        t.payment_method,
        t.status,
        t.notes,
        t.created_at,
        t.updated_at
      FROM transactions t
      WHERE t.sender_id = $1
    `;
    
    const params = [userId];

    if (status) {
      query += ` AND t.status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE sender_id = $1',
      [userId]
    );

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ error: 'Failed to fetch transfer history' });
  }
});

// -----------------------------
// GET /transfers/:id - Get single transfer details
// -----------------------------
router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const result = await pool.query(
      `SELECT * FROM transactions 
       WHERE id = $1 AND sender_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transfer not found' });
    }

    res.json({ transaction: result.rows[0] });

  } catch (err) {
    console.error('Fetch transfer error:', err);
    res.status(500).json({ error: 'Failed to fetch transfer details' });
  }
});

// -----------------------------
// POST /transfers/calculate-fee - Calculate transfer fee
// -----------------------------
router.post('/calculate-fee', authenticate, async (req, res) => {
  const { amount, fromCurrency, toCurrency } = req.body;

  try {
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const feePercentage = 0.025;
    const flatFee = 2.00;
    const transferFee = (parseFloat(amount) * feePercentage) + flatFee;
    const totalAmount = parseFloat(amount) + transferFee;

    const exchangeRates = {
      'CAD-KES': 96.50,
      'USD-KES': 130.00,
      'KES-CAD': 0.0104,
      'KES-USD': 0.0077
    };

    const rateKey = `${fromCurrency}-${toCurrency}`;
    const exchangeRate = exchangeRates[rateKey] || 1;
    const recipientAmount = parseFloat(amount) * exchangeRate;

    res.json({
      amount: parseFloat(amount),
      fee: parseFloat(transferFee.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      exchangeRate: exchangeRate,
      recipientAmount: parseFloat(recipientAmount.toFixed(2)),
      fromCurrency,
      toCurrency
    });

  } catch (err) {
    console.error('Calculate fee error:', err);
    res.status(500).json({ error: 'Failed to calculate fee' });
  }
});

export default router;