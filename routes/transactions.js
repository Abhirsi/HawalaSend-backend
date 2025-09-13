// routes/transactions.js - Complete production-ready transaction functionality
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
      console.log('Transactions: No token provided');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Transactions: Token verified for user:', decoded.id);
    
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
    console.error('Transactions auth error:', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// GET /transactions - Get all transactions for user
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;
    
    console.log(`Fetching transactions for user ${userId}, limit: ${limit}, offset: ${offset}`);
    
    const result = await pool.query(
      `SELECT t.*,
              u_sender.email as sender_email,
              u_sender.username as sender_username,
              u_receiver.email as receiver_email,
              u_receiver.username as receiver_username,
              CASE 
                WHEN t.sender_id = $1 THEN 'send'
                WHEN t.receiver_id = $1 THEN 'receive'
              END as type
       FROM transactions t
       LEFT JOIN users u_sender ON t.sender_id = u_sender.id
       LEFT JOIN users u_receiver ON t.receiver_id = u_receiver.id
       WHERE t.sender_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    
    // Get total count for pagination
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM transactions WHERE sender_id = $1 OR receiver_id = $1',
      [userId]
    );
    
    console.log(`Found ${result.rows.length} transactions`);
    
    const transactions = result.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      currency: tx.currency || 'USD',
      description: tx.description,
      status: tx.status,
      referenceId: tx.reference_id,
      createdAt: tx.created_at,
      completedAt: tx.completed_at,
      sender: {
        email: tx.sender_email,
        username: tx.sender_username
      },
      receiver: {
        email: tx.receiver_email,
        username: tx.receiver_username
      },
      otherParty: tx.type === 'send' ? tx.receiver_username || tx.receiver_email : tx.sender_username || tx.sender_email,
      otherPartyEmail: tx.type === 'send' ? tx.receiver_email : tx.sender_email
    }));
    
    res.json({
      transactions,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /transactions/recent - Get recent transactions for dashboard
router.get('/recent', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit || 5;
    
    console.log(`Fetching ${limit} recent transactions for user ${userId}`);
    
    const result = await pool.query(
      `SELECT t.*,
              u_sender.email as sender_email,
              u_sender.username as sender_username,
              u_receiver.email as receiver_email,
              u_receiver.username as receiver_username,
              CASE 
                WHEN t.sender_id = $1 THEN 'send'
                WHEN t.receiver_id = $1 THEN 'receive'
              END as type
       FROM transactions t
       LEFT JOIN users u_sender ON t.sender_id = u_sender.id
       LEFT JOIN users u_receiver ON t.receiver_id = u_receiver.id
       WHERE t.sender_id = $1 OR t.receiver_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    
    console.log(`Found ${result.rows.length} recent transactions`);
    
    const transactions = result.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      currency: tx.currency || 'USD',
      description: tx.description,
      status: tx.status,
      createdAt: tx.created_at,
      otherParty: tx.type === 'send' ? tx.receiver_username || tx.receiver_email : tx.sender_username || tx.sender_email,
      otherPartyEmail: tx.type === 'send' ? tx.receiver_email : tx.sender_email
    }));
    
    res.json(transactions);
    
  } catch (error) {
    console.error('Fetch recent transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

// GET /transactions/stats - Get transaction statistics
router.get('/stats', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log(`Fetching transaction stats for user ${userId}`);
    
    // Get basic stats
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN sender_id = $1 THEN amount ELSE 0 END) as total_sent,
        SUM(CASE WHEN receiver_id = $1 THEN amount ELSE 0 END) as total_received,
        SUM(CASE WHEN sender_id = $1 THEN fee ELSE 0 END) as total_fees_paid
       FROM transactions
       WHERE (sender_id = $1 OR receiver_id = $1) AND status = 'completed'`,
      [userId]
    );
    
    // Get monthly stats for last 6 months
    const monthlyResult = await pool.query(
      `SELECT 
        DATE_TRUNC('month', created_at) as month,
        SUM(CASE WHEN sender_id = $1 THEN amount ELSE 0 END) as sent,
        SUM(CASE WHEN receiver_id = $1 THEN amount ELSE 0 END) as received,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE (sender_id = $1 OR receiver_id = $1)
         AND status = 'completed'
         AND created_at >= NOW() - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC`,
      [userId]
    );
    
    const stats = {
      totalTransactions: parseInt(statsResult.rows[0].total_transactions) || 0,
      totalSent: parseFloat(statsResult.rows[0].total_sent) || 0,
      totalReceived: parseFloat(statsResult.rows[0].total_received) || 0,
      totalFeesPaid: parseFloat(statsResult.rows[0].total_fees_paid) || 0,
      netAmount: (parseFloat(statsResult.rows[0].total_received) || 0) - (parseFloat(statsResult.rows[0].total_sent) || 0),
      monthlyStats: monthlyResult.rows.map(row => ({
        month: row.month,
        sent: parseFloat(row.sent) || 0,
        received: parseFloat(row.received) || 0,
        transactionCount: parseInt(row.transaction_count) || 0,
        netAmount: (parseFloat(row.received) || 0) - (parseFloat(row.sent) || 0)
      }))
    };
    
    console.log(`Stats: ${stats.totalTransactions} transactions, $${stats.totalSent} sent, $${stats.totalReceived} received`);
    
    res.json(stats);
    
  } catch (error) {
    console.error('Fetch transaction stats error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction statistics' });
  }
});

// GET /transactions/:id - Get single transaction by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const transactionId = req.params.id;
    
    console.log(`Fetching transaction ${transactionId} for user ${userId}`);
    
    const result = await pool.query(
      `SELECT t.*,
              u_sender.email as sender_email,
              u_sender.username as sender_username,
              u_receiver.email as receiver_email,
              u_receiver.username as receiver_username,
              CASE 
                WHEN t.sender_id = $1 THEN 'send'
                WHEN t.receiver_id = $1 THEN 'receive'
              END as type
       FROM transactions t
       LEFT JOIN users u_sender ON t.sender_id = u_sender.id
       LEFT JOIN users u_receiver ON t.receiver_id = u_receiver.id
       WHERE t.id = $2 AND (t.sender_id = $1 OR t.receiver_id = $1)`,
      [userId, transactionId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const tx = result.rows[0];
    
    const transaction = {
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      currency: tx.currency || 'USD',
      description: tx.description,
      status: tx.status,
      referenceId: tx.reference_id,
      createdAt: tx.created_at,
      completedAt: tx.completed_at,
      updatedAt: tx.updated_at,
      metadata: tx.metadata,
      sender: {
        email: tx.sender_email,
        username: tx.sender_username
      },
      receiver: {
        email: tx.receiver_email,
        username: tx.receiver_username
      }
    };
    
    res.json(transaction);
    
  } catch (error) {
    console.error('Fetch transaction error:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// GET /transactions/search - Search transactions
router.get('/search', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { query, status, type, startDate, endDate, limit = 20, offset = 0 } = req.query;
    
    console.log(`Searching transactions for user ${userId} with query: ${query}`);
    
    let searchQuery = `
      SELECT t.*,
             u_sender.email as sender_email,
             u_sender.username as sender_username,
             u_receiver.email as receiver_email,
             u_receiver.username as receiver_username,
             CASE 
               WHEN t.sender_id = $1 THEN 'send'
               WHEN t.receiver_id = $1 THEN 'receive'
             END as type
      FROM transactions t
      LEFT JOIN users u_sender ON t.sender_id = u_sender.id
      LEFT JOIN users u_receiver ON t.receiver_id = u_receiver.id
      WHERE (t.sender_id = $1 OR t.receiver_id = $1)
    `;
    
    const queryParams = [userId];
    let paramCounter = 2;
    
    // Add search filters
    if (query) {
      searchQuery += ` AND (t.description ILIKE $${paramCounter} OR u_sender.email ILIKE $${paramCounter} OR u_receiver.email ILIKE $${paramCounter})`;
      queryParams.push(`%${query}%`);
      paramCounter++;
    }
    
    if (status) {
      searchQuery += ` AND t.status = $${paramCounter}`;
      queryParams.push(status);
      paramCounter++;
    }
    
    if (startDate) {
      searchQuery += ` AND t.created_at >= $${paramCounter}`;
      queryParams.push(startDate);
      paramCounter++;
    }
    
    if (endDate) {
      searchQuery += ` AND t.created_at <= $${paramCounter}`;
      queryParams.push(endDate);
      paramCounter++;
    }
    
    searchQuery += ` ORDER BY t.created_at DESC LIMIT $${paramCounter} OFFSET $${paramCounter + 1}`;
    queryParams.push(limit, offset);
    
    const result = await pool.query(searchQuery, queryParams);
    
    const transactions = result.rows.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: parseFloat(tx.amount),
      fee: parseFloat(tx.fee || 0),
      description: tx.description,
      status: tx.status,
      createdAt: tx.created_at,
      otherParty: tx.type === 'send' ? tx.receiver_username || tx.receiver_email : tx.sender_username || tx.sender_email
    }));
    
    res.json({
      transactions,
      query: query,
      total: transactions.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch (error) {
    console.error('Search transactions error:', error);
    res.status(500).json({ error: 'Failed to search transactions' });
  }
});

export default router;