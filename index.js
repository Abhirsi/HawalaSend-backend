import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import pool from './pool.js';
import authRoutes from './routes/auth.js';
import transferRoutes from './routes/transfer.js';
import transactionRoutes from './routes/transactions.js';

// Import simplified security middleware
import { 
  securityHeaders, 
  generalRateLimit, 
  securityLogger, 
  sanitizeInput,
  apiVersioning,
  requestSizeLimiter 
} from './middleware/security.js';

dotenv.config({ path: './.env.local' });

const app = express();

// CRITICAL: Fix trust proxy for Railway deployment
app.set('trust proxy', 1); // Changed from true to 1 for Railway compatibility

// Security headers - must be first
app.use(securityHeaders);

// Request logging and monitoring
app.use(securityLogger);

// General rate limiting (simplified)
app.use(generalRateLimit);

// Input sanitization
app.use(sanitizeInput);
app.use(apiVersioning);
app.use(requestSizeLimiter);

// CORS configuration

// CORS configuration - Add the actual Vercel deployment URL
// Temporary fix - replace your CORS section with this:
app.use(cors({ 
  origin: function (origin, callback) {
    // Allow all Vercel deployments and localhost
    if (!origin || 
        origin.includes('vercel.app') || 
        origin.includes('localhost') ||
        origin === 'https://hawalasend.vercel.app') {
      return callback(null, true);
    }
    console.log(`🚫 CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(cors({ 
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`🚫 CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Test database connection on startup
const testDatabaseConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW(), version()');
    console.log('🔗 Database connected as user:', process.env.PGUSER || 'postgres');
    console.log('📊 Database info:', result.rows[0].version.split(' ')[0]);
  } catch (error) {
    console.error('❌ Error connecting to database:', error.message);
    // Don't exit in production, log and continue
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Database connection failed, but server will continue running');
    }
  }
};

// Database setup route - Creates tables and test users
app.get('/setup-database', async (req, res) => {
  try {
    console.log('🔧 Creating database tables...');
    
    // Create users table with security fields
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
    
    // Add columns if they don't exist (for existing users table)
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS login_attempts INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL,
      ADD COLUMN IF NOT EXISTS last_login TIMESTAMP NULL
    `);
    
    console.log('✅ Users table updated');
    
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
    
    // Insert test users (use existing password hash)
    const testHash = '$2b$10$CwTycUXWue0Thq9StjUM0uehufrkKbXnq3wi5qCa6ZAQLn1s6Vhwi';
    
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING
    `, ['testuser@example.com', 'testuser', testHash, 'Test', 'User', '+1234567890', 2500.00]);
    
    await pool.query(`
      INSERT INTO users (email, username, password_hash, first_name, last_name, phone, balance) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO NOTHING  
    `, ['recipientuser@example.com', 'recipientuser', testHash, 'Recipient', 'User', '+0987654321', 1000.00]);
    
    // Verify tables
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

// Routes
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
      environment: process.env.NODE_ENV || 'development',
      security: {
        rateLimit: 'active',
        securityHeaders: 'active',
        inputSanitization: 'active',
        trustProxy: 'enabled'
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
      error: process.env.NODE_ENV === 'production' ? 'Database connection failed' : error.message
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
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// 404 handler
app.use('*', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;
  console.log(`🚫 404 - Route not found: ${req.method} ${req.originalUrl} - IP: ${ip}`);
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🚨 Global error:', err.stack);
  
  // Don't expose sensitive error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    timestamp: new Date().toISOString(),
    ...(isDevelopment && { stack: err.stack })
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
  
  // Test database connection after server starts
  testDatabaseConnection();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Process terminated');
    pool.end(); // Close database connections
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;