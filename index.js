// ============================
// index.js - Main Server File
// ============================

// Core dependencies
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

// Database connection
import pool from './pool.js';

// Routes
import authRoutes from './routes/auth.js';
import transferRoutes from './routes/transfer.js';
import transactionRoutes from './routes/transactions.js';

// Security middleware
import {
  securityHeaders,
  generalRateLimit,
  securityLogger,
  sanitizeInput,
  apiVersioning,
  requestSizeLimiter
} from './middleware/security.js';

import helmet from 'helmet';

// Load environment variables
// ===== Load Environment Variables =====

// Explicitly tell dotenv to load from backend/.env if NODE_ENV=development
dotenv.config({
  path: process.env.NODE_ENV === 'production' 
    ? '.env.production' 
    : '.env'
});

// Debug: show which file is being used
console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
console.log(`📂 Loaded env file: ${process.env.NODE_ENV === 'production' ? '.env.production' : '.env'}`);

// ===== Check Critical Variables =====
if (!process.env.JWT_SECRET || (!process.env.PGDATABASE && !process.env.DATABASE_URL)) {
  throw new Error('❌ Missing critical environment variables: JWT_SECRET or Database (PGDATABASE/DATABASE_URL)');
}


const app = express();

// -----------------------------
// Trust proxy (important for Railway/Vercel)
// -----------------------------
app.set('trust proxy', 1);

// -----------------------------
// Global Security Middleware
// -----------------------------
app.use(helmet());          // Harden HTTP headers
app.use(securityHeaders);   // Your custom security headers (keep if you have extras)
app.use(securityLogger);    // Log incoming requests
app.use(generalRateLimit);  // Global rate limiting
app.use(sanitizeInput);     // Sanitize request inputs
app.use(apiVersioning);     // Version API
app.use(requestSizeLimiter);// Limit body size
app.use(cookieParser());    // Parse cookies

// -----------------------------
// CORS Setup
// -----------------------------
const allowedOrigins = [/\.vercel\.app$/, /localhost/];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow Postman/mobile
    if (allowedOrigins.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// -----------------------------
// Parsers
// -----------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -----------------------------
// DB Connection Test
// -----------------------------
const testDatabaseConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW(), version()');
    console.log('🔗 Database connected:', result.rows[0].now);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    if (process.env.NODE_ENV === 'production') {
      console.log('⚠️ Continuing without DB until issue is fixed');
    } else {
      process.exit(1);
    }
  }
};

// -----------------------------
// Routes
// -----------------------------
app.use('/auth', authRoutes);
app.use('/transfers', transferRoutes);
//app.use('/transfers', transfersRoutes);
app.use('/transactions', transactionRoutes);

// Health check route
app.get('/health', async (req, res) => {
  try {
    const dbTest = await pool.query('SELECT NOW() as current_time');
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: { connected: true, time: dbTest.rows[0].current_time }
    });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: 'DB connection failed' });
  }
});

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'HawalaSend API - Secure Money Transfer Service',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// -----------------------------
// Development-only routes
// -----------------------------
if (process.env.NODE_ENV !== 'production') {
  // ⚠️ Only enable in development, block in production
  app.get('/setup-database', async (req, res) => {
    // DB setup logic here (kept short for safety)
    res.json({ message: 'Dev-only database setup endpoint' });
  });

  app.post('/fix-database', (req, res) => {
    res.json({ message: 'Dev-only schema fix endpoint' });
  });

  app.post('/fix-constraint', (req, res) => {
    res.json({ message: 'Dev-only constraint fix endpoint' });
  });
}

// -----------------------------
// Error Handling
// -----------------------------
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('🚨 Error:', err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error'
  });
});

// -----------------------------
// Start Server
// -----------------------------
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  testDatabaseConnection();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => pool.end());
});

process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', reason => {
  console.error('💥 Unhandled Rejection:', reason);
  process.exit(1);
});

export default app;
