// Save as: backend/routes/transactions.js
import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
dotenv.config();

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://hawala_user:securepassword123@localhost:5432/money_transfer_app'
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify authentication (fixed to match working transfers.js)
const authenticate = async (req, res, next) => {
  try {
    // More robust token extraction that matches transfers.js
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      console.log('Transactions: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    console.log('Transactions: Token received (first 20 chars):', token.substring(0, 20));
    
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Transactions: Decoded JWT:', decoded);
    
    // Handle both 'id' and 'userId' from JWT
    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token structure' });
    }
    
    // Get user from database
    const userResult = await pool.query(
      'SELECT id, email, username FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }
    
    req.user = userResult.rows[0];
    console.log('Transactions: Authenticated user:', req.user.id);
    next();
  } catch (error) {
    console.error('Transactions auth error:', error.message);
    console.error('Full error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

// Get all transactions for a user (fixed schema)
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    
    console.log(`Fetching transactions for user ${userId}, limit: ${limit}, offset: ${offset}`);
    
    // Fixed query to use actual schema (sender_id/receiver_id instead of user_id)
    const result = await pool.query(`
      SELECT 
        t.id,
        t.amount,
        t.description,
        t.status,
        t.created_at,
        t.completed_at,
        t.reference_id,
        t.fee,
        t.currency,
        sender.username as sender_name,
        sender.email as sender_email,
        receiver.username as receiver_name,
        receiver.email as receiver_email,
        CASE 
          WHEN t.sender_id = $1 THEN 'send'
          WHEN t.receiver_id = $1 THEN 'receive'
        END as type
      FROM transactions t
      LEFT JOIN users sender ON t.sender_id = sender.id
      LEFT JOIN users receiver ON t.receiver_id = receiver.id
      WHERE t.sender_id = $1 OR t.receiver_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Get total count for pagination
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE sender_id = $1 OR receiver_id = $1',
      [userId]
    );
    
    console.log(`Found ${result.rows.length} transactions`);
    
    res.json({
      transactions: result.rows.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: parseFloat(tx.amount),
        fee: parseFloat(tx.fee || 0),
        currency: tx.currency,
        description: tx.description,
        status: tx.status,
        referenceId: tx.reference_id,
        createdAt: tx.created_at,
        completedAt: tx.completed_at,
        sender: {
          name: tx.sender_name,
          email: tx.sender_email
        },
        receiver: {
          name: tx.receiver_name,
          email: tx.receiver_email
        },
        // Simplified other party info
        otherParty: tx.type === 'send' ? tx.receiver_name : tx.sender_name,
        otherPartyEmail: tx.type === 'send' ? tx.receiver_email : tx.sender_email
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get recent transactions (for dashboard) - fixed schema
router.get('/recent', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit || 5;
    
    console.log(`Fetching ${limit} recent transactions for user ${userId}`);
    
    const result = await pool.query(`
      SELECT 
        t.id,
        t.amount,
        t.description,
        t.status,
        t.created_at,
        t.fee,
        t.currency,
        sender.username as sender_name,
        sender.email as sender_email,
        receiver.username as receiver_name,
        receiver.email as receiver_email,
        CASE 
          WHEN t.sender_id = $1 THEN 'send'
          WHEN t.receiver_id = $1 THEN 'receive'
        END as type
      FROM transactions t
      LEFT JOIN users sender ON t.sender_id = sender.id
      LEFT JOIN users receiver ON t.receiver_id = receiver.id
      WHERE t.sender_id = $1 OR t.receiver_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    console.log(`Found ${result.rows.length} recent transactions`);
    
    res.json(result.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      currency: tx.currency,
      description: tx.description,
      status: tx.status,
      createdAt: tx.created_at,
      otherParty: tx.type === 'send' ? tx.receiver_name : tx.sender_name,
      otherPartyEmail: tx.type === 'send' ? tx.receiver_email : tx.sender_email
    })));
    
  } catch (error) {
    console.error('Fetch recent transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

// Get transaction statistics (fixed schema)
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`Fetching transaction stats for user ${userId}`);
    
    // Get total sent, received, and transaction count
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN sender_id = $1 THEN amount ELSE 0 END) as total_sent,
        SUM(CASE WHEN receiver_id = $1 THEN amount ELSE 0 END) as total_received,
        SUM(CASE WHEN sender_id = $1 THEN fee ELSE 0 END) as total_fees_paid
      FROM transactions
      WHERE (sender_id = $1 OR receiver_id = $1) AND status = 'completed'
    `, [userId]);
    
    // Get monthly statistics for the last 6 months
    const monthlyResult = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(CASE WHEN sender_id = $1 THEN amount ELSE 0 END) as sent,
        SUM(CASE WHEN receiver_id = $1 THEN amount ELSE 0 END) as received,
        COUNT(*) as transaction_count
      FROM transactions
      WHERE (sender_id = $1 OR receiver_id = $1)
        AND status = 'completed'
        AND created_at >= NOW() - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `, [userId]);
    
    const stats = {
      totalTransactions: parseInt(result.rows[0].total_transactions) || 0,
      totalSent: parseFloat(result.rows[0].total_sent) || 0,
      totalReceived: parseFloat(result.rows[0].total_received) || 0,
      totalFeesPaid: parseFloat(result.rows[0].total_fees_paid) || 0,
      netAmount: (parseFloat(result.rows[0].total_received) || 0) - (parseFloat(result.rows[0].total_sent) || 0),
      monthlyStats: monthlyResult.rows.map(row => ({
        month: row.month,
        sent: parseFloat(row.sent) || 0,
        received: parseFloat(row.received) || 0,
        transactionCount: parseInt(row.transaction_count) || 0,
        netAmount: (parseFloat(row.received) || 0) - (parseFloat(row.sent) || 0)
      }))
    };
    
    console.log(`Stats calculated: ${stats.totalTransactions} transactions, $${stats.totalSent} sent, $${stats.totalReceived} received`);
    
    res.json(stats);
    
  } catch (error) {
    console.error('Fetch transaction stats error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction statistics' });
  }
});

// Get single transaction by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const transactionId = req.params.id;
    
    console.log(`Fetching transaction ${transactionId} for user ${userId}`);
    
    const result = await pool.query(`
      SELECT 
        t.*,
        sender.username as sender_name,
        sender.email as sender_email,
        receiver.username as receiver_name,
        receiver.email as receiver_email,
        CASE 
          WHEN t.sender_id = $1 THEN 'send'
          WHEN t.receiver_id = $1 THEN 'receive'
        END as type
      FROM transactions t
      LEFT JOIN users sender ON t.sender_id = sender.id
      LEFT JOIN users receiver ON t.receiver_id = receiver.id
      WHERE t.id = $2 AND (t.sender_id = $1 OR t.receiver_id = $1)
    `, [userId, transactionId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const tx = result.rows[0];
    
    res.json({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      currency: tx.currency,
      description: tx.description,
      status: tx.status,
      referenceId: tx.reference_id,
      createdAt: tx.created_at,
      completedAt: tx.completed_at,
      updatedAt: tx.updated_at,
      metadata: tx.metadata,
      sender: {
        name: tx.sender_name,
        email: tx.sender_email
      },
      receiver: {
        name: tx.receiver_name,
        email: tx.receiver_email
      }
    });
    
  } catch (error) {
    console.error('Fetch transaction error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

export default router;