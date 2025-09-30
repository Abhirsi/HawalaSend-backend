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

    if (!recipientName || !recipientEmail) {
      return res.status(400).json({ error: 'Recipient information required' });
    }

    if (!fromCurrency || !toCurrency) {
      return res.status(400).json({ error: 'Currency information required' });
    }

    // Calculate fees (2.5% + $2 flat fee)
    const feePercentage = 0.025;
    const flatFee = 2.00;
    const transferFee = (parseFloat(amount) * feePercentage) + flatFee;
    const totalAmount = parseFloat(amount) + transferFee;

    // Exchange rate (CAD to KES - approximate)
    const exchangeRate = 96.50; // Update with real-time rate in production
    const recipientAmount = toCurrency === 'KES' ? amount * exchangeRate : amount;

    // Check if this is a card-only transfer system (no balance needed)
    // For card-based transfers, you would integrate with Stripe/Square here

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
        'pending' // Status: pending, completed, failed
      ]
    );

    const transaction = result.rows[0];

    // TODO: In production, integrate payment processing here:
    // - Stripe for card payments
    // - Payment verification
    // - Update status to 'completed' after successful payment

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
    console.error('❌ Transfer error:', err);
    res.status(500).json({ error: 'Transfer failed. Please try again.' });
  }
});

// -----------------------------
// GET /transfers/history - Get user's transfer history
// -----------------------------
router.get('/history', authenticate, async (req, res) => {
  const userId = req.user.id;
  const { limit = 50, offset = 0, status } = req.query;

  try {
    let query = `
      SELECT 
        id,
        recipient_name,
        recipient_email,
        amount,
        fee,
        total_amount,
        from_currency,
        to_currency,
        recipient_amount,
        exchange_rate,
        payment_method,
        status,
        created_at,
        updated_at
      FROM transactions 
      WHERE sender_id = $1
    `;
    
    const params = [userId];

    // Filter by status if provided
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count
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
    console.error('❌ Fetch history error:', err);
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
    console.error('❌ Fetch transfer error:', err);
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

    // Fee calculation: 2.5% + $2 flat fee
    const feePercentage = 0.025;
    const flatFee = 2.00;
    const transferFee = (parseFloat(amount) * feePercentage) + flatFee;
    const totalAmount = parseFloat(amount) + transferFee;

    // Exchange rates (update with real-time rates in production)
    const exchangeRates = {
      'CAD-KES': 96.50,
      'KES-CAD': 0.0104
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
    console.error('❌ Calculate fee error:', err);
    res.status(500).json({ error: 'Failed to calculate fee' });
  }
});

export default router;