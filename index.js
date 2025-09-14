import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import pool from './pool.js';
import authRoutes from './routes/auth.js';
import transferRoutes from './routes/transfer.js';
import transactionRoutes from './routes/transactions.js';

// Import security middleware
import { 
  securityHeaders, 
  generalRateLimit, 
  securityLogger, 
  sanitizeInput 
} from './middleware/security.js';

dotenv.config({ path: './.env.local' });

const app = express();

// Security headers - must be first
app.use(securityHeaders);

// Request logging and monitoring
app.use(securityLogger);

// General rate limiting
app.use(generalRateLimit);

// Input sanitization
app.use(sanitizeInput);

// CORS configuration
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:3000', 
  'https://hawalasend.vercel.app'
];

console.log('✅ Allowed Origins:', allowedOrigins);

app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test database connection on startup
const testDatabaseConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('🔗 Database connected as user:', process.env.PGUSER || 'postgres');
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
  }
};

// Security status endpoint
app.get('/security-status', (req, res) => {
  res.json({
    status: 'secure',
    features: {
      rateLimit: true,
      securityHeaders: true,
      inputSanitization: true,
      corsProtection: true,
      requestLogging: true
    },
    timestamp: new Date().toISOString()
  });
});

// Database setup route - Creates tables and test users
app.get('/setup-database', async (req, res) => {
  try {
    console.log('🔧 Creating database tables...');
    
    // Create users table with enhanced security fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        balance DECIMAL(15,2) DEFAULT 0.00,
        login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP NULL,
        last_login TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Users table created');
    
    // Create transactions table  
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        fee DECIMAL(15,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'USD',
        description TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        CONSTRAINT chk_sender_receiver_diff CHECK (sender_id <> receiver_id),
        CONSTRAINT transactions_amount_check CHECK (amount > 0),
        CONSTRAINT transactions_fee_check CHECK (fee >= 0),
        CONSTRAINT chk_completion_status CHECK (
          (status = 'completed' AND completed_at IS NOT NULL) OR 
          (status <> 'completed' AND completed_at IS NULL)
        )
      )
    `);
    console.log('✅ Transactions table created');
    
    // Create security_logs table for monitoring
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(50) NOT NULL,
        ip_address INET,
        user_agent TEXT,
        success BOOLEAN DEFAULT false,
        details JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Security logs table created');
    
    // Insert test users with stronger password hash
    const strongHash = '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/VdEbXq4TK'; // password123
    
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING
    `, ['testuser@example.com', 'testuser', strongHash, 'Test', 'User', '+1234567890', 2500.00]);
    
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING  
    `, ['recipientuser@example.com', 'recipientuser', strongHash, 'Recipient', 'User', '+0987654321', 1000.00]);
    
    // Verify tables were created
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const transactionsCount = await pool.query('SELECT COUNT(*) FROM transactions');
    const securityLogsCount = await pool.query('SELECT COUNT(*) FROM security_logs');
    
    console.log('✅ Database setup complete');
    res.json({ 
      message: 'Database setup complete with security enhancements!',
      users: usersCount.rows[0].count,
      transactions: transactionsCount.rows[0].count,
      securityLogs: securityLogsCount.rows[0].count,
      status: 'success'
    });
  } catch (error) {
    console.error('❌ Database setup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Routes with security middleware
app.use('/auth', authRoutes);
app.use('/transfers', transferRoutes);
app.use('/transactions', transactionRoutes);

// Enhanced health check
app.get('/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW() as current_time');
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      security: {
        rateLimit: 'active',
        securityHeaders: 'active',
        inputSanitization: 'active'
      },
      database: {
        status: 'connected',
        currentTime: dbTest.rows[0].current_time,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'HawalaSend API - Secure Money Transfer Service',
    status: 'healthy',
    security: 'enabled',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`🚫 404 - Route not found: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Global error:', err.stack);
  
  // Log security-related errors
  if (err.type === 'security') {
    console.log(`🔍 Security Error - ${req.method} ${req.path}: ${err.message}`);
  }
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log('🚀 HawalaSend backend server running...');
  console.log(`• Port: ${PORT}`);
  console.log(`• Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`• Database: ${process.env.PGDATABASE || 'money_transfer_app'}`);
  console.log('🔒 Security features: ENABLED');
  console.log('📡 Server ready to accept connections');
  
  testDatabaseConnection();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
  });
});